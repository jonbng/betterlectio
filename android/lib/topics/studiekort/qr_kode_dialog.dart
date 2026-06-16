import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lectio_wrapper/types/studiekort/kort.dart';
import 'package:lectio_wrapper/utils/dio_image_provider.dart';
import 'package:betterlectio/topics/studiekort/studiekort_bloc.dart';
import 'package:betterlectio/utils/state_pattern.dart';

class QrKodeDialog extends StatefulWidget {
  const QrKodeDialog({
    super.key,
    required this.bloc,
  });

  final StudiekortBloc bloc;

  @override
  State<QrKodeDialog> createState() => _QrKodeDialogState();
}

class _QrKodeDialogState extends State<QrKodeDialog> {
  late Timer timer;
  @override
  void initState() {
    super.initState();
    timer = Timer(const Duration(seconds: 20), () {
      Navigator.pop(context);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      surfaceTintColor: Colors.transparent,
      backgroundColor: Colors.transparent,
      shadowColor: Colors.transparent,
      insetPadding: EdgeInsets.zero,
      child: SizedBox(
        width: 220,
        height: 220,
        child: BlocBuilder<StudiekortBloc, StatePattern<(Kort?, DioImage?)?>>(
          bloc: widget.bloc,
          builder: (context, state) {
            if (state.state != null && state.state!.$2 != null) {
              return Image(image: state.state!.$2!);
            }
            return const CircularProgressIndicator();
          },
        ),
      ),
    );
  }

  @override
  void dispose() {
    timer.cancel();
    super.dispose();
  }
}
